# Tauri Foundation and Project Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing K.G.Studio React application inside Tauri 2 with a typed Rust bridge for app/runtime information and native project workspace persistence, without regressing the existing browser build.

**Architecture:** Keep the existing React/KG domain intact and introduce Tauri as an outer desktop runtime. Rust owns native paths and atomic filesystem writes; TypeScript accesses it only through a narrow `bridge` module. Browser mode keeps a compatibility adapter so tests and existing web workflows continue to run.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Vitest, Playwright, Tauri 2, Rust stable, Serde, Tokio, UUID, thiserror.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- Preserve the existing `KGProject`, project upgrader, and current web tests.
- React must not import Tauri APIs outside `src/bridge/`.
- Native writes must use temp-file + rename semantics.
- The browser build remains supported for tests and development.
- No AI/model runtime is introduced in this milestone.

---

### Task 1: Add the Tauri shell without changing K.G.Studio behavior

**Files:**
- Modify: `package.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: Vite dev server/build from the existing repository.
- Produces: `kg_studio::run()` and npm scripts `tauri:dev`, `tauri:build`.

- [ ] **Step 1: Add a smoke test target in Rust**

```rust
// src-tauri/src/lib.rs
#[cfg(test)]
mod tests {
    #[test]
    fn app_identity_is_stable() {
        assert_eq!(super::APP_ID, "com.kgaudiolab.kgstudio");
    }
}
```

- [ ] **Step 2: Create the minimal Tauri crate and run the failing test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: FAIL until `APP_ID` and the crate files exist.

- [ ] **Step 3: Implement the minimal shell**

```rust
// src-tauri/src/lib.rs
pub const APP_ID: &str = "com.kgaudiolab.kgstudio";

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run K.G.Studio");
}
```

```rust
// src-tauri/src/main.rs
fn main() {
    kg_studio::run();
}
```

Add package scripts:

```json
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

- [ ] **Step 4: Verify both desktop and web builds**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
npm run test:run
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json src-tauri
git commit -m "feat: add Tauri desktop shell"
```

---

### Task 2: Introduce a single typed frontend bridge

**Files:**
- Create: `src/bridge/runtimeBridge.ts`
- Create: `src/bridge/runtimeBridge.test.ts`
- Create: `src/bridge/types.ts`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/runtime.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces TypeScript:

```ts
export interface RuntimeInfo {
  platform: string;
  appVersion: string;
  desktop: boolean;
}

export interface RuntimeBridge {
  getRuntimeInfo(): Promise<RuntimeInfo>;
}
```

- Produces Rust command: `get_runtime_info() -> Result<RuntimeInfoDto, String>`.

- [ ] **Step 1: Write bridge tests for desktop and browser adapters**

```ts
it('uses browser fallback when Tauri is unavailable', async () => {
  const bridge = createRuntimeBridge({ invoke: undefined });
  await expect(bridge.getRuntimeInfo()).resolves.toMatchObject({ desktop: false });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test:run -- src/bridge/runtimeBridge.test.ts`

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement the adapter boundary**

```ts
export function createRuntimeBridge(deps: { invoke?: (cmd: string) => Promise<unknown> }): RuntimeBridge {
  return {
    async getRuntimeInfo() {
      if (!deps.invoke) {
        return { platform: navigator.platform || 'browser', appVersion: 'web', desktop: false };
      }
      return deps.invoke('get_runtime_info') as Promise<RuntimeInfo>;
    },
  };
}
```

Implement matching Serde DTO and register the command with `tauri::generate_handler!`.

- [ ] **Step 4: Run TypeScript and Rust tests**

```bash
npm run test:run -- src/bridge/runtimeBridge.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bridge src-tauri/src/commands src-tauri/src/lib.rs
git commit -m "feat: add typed desktop runtime bridge"
```

---

### Task 3: Create native project workspace paths and atomic text persistence

**Files:**
- Create: `src-tauri/src/project/mod.rs`
- Create: `src-tauri/src/project/workspace.rs`
- Create: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/storage/atomic_file.rs`
- Test: inline Rust unit tests in both modules.

**Interfaces:**
- Produces:

```rust
pub struct ProjectWorkspace {
    pub root: PathBuf,
    pub project_json: PathBuf,
    pub audio_dir: PathBuf,
    pub mastering_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub metadata_dir: PathBuf,
}

pub fn create_workspace(parent: &Path, project_name: &str) -> Result<ProjectWorkspace, WorkspaceError>;
pub fn atomic_write_text(path: &Path, contents: &str) -> Result<(), AtomicWriteError>;
```

- [ ] **Step 1: Write failing workspace tests**

```rust
#[test]
fn creates_expected_project_layout() {
    let temp = tempfile::tempdir().unwrap();
    let ws = create_workspace(temp.path(), "Neon Abyss").unwrap();
    assert!(ws.audio_dir.ends_with("Neon Abyss.kgstudio/audio"));
    assert!(ws.mastering_dir.exists());
}
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml project::`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement validated workspace creation and atomic writes**

Use a temporary sibling file `.<name>.tmp-<uuid>`, `sync_all`, then `rename` into place. Reject project names containing `/`, `\\`, NUL, `..`, or empty/whitespace-only names.

- [ ] **Step 4: Add an overwrite-safety test**

```rust
#[test]
fn atomic_write_replaces_complete_file() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("project.json");
    atomic_write_text(&path, "old").unwrap();
    atomic_write_text(&path, "new").unwrap();
    assert_eq!(std::fs::read_to_string(path).unwrap(), "new");
}
```

- [ ] **Step 5: Run tests and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml

git add src-tauri/src/project src-tauri/src/storage src-tauri/Cargo.toml
git commit -m "feat: add native project workspace persistence"
```

---

### Task 4: Add project save/load commands while preserving KG serialization

**Files:**
- Create: `src/bridge/projectBridge.ts`
- Create: `src/bridge/projectBridge.test.ts`
- Create: `src-tauri/src/commands/project.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/core/io/KGProjectStorage.ts`
- Test: `src/core/io/KGProjectStorage.test.ts`

**Interfaces:**
- Produces TypeScript:

```ts
export interface DesktopProjectBridge {
  createProject(parentDir: string, projectName: string, projectJson: string): Promise<string>;
  saveProject(projectRoot: string, projectJson: string): Promise<void>;
  loadProject(projectRoot: string): Promise<string>;
}
```

- Rust receives/returns serialized JSON strings; it does not deserialize `KGProject` in this milestone.

- [ ] **Step 1: Add a failing storage delegation test**

```ts
it('delegates desktop save to project bridge without changing serialized JSON', async () => {
  const serialized = '{"projectStructureVersion":17}';
  await storage.saveDesktop('/tmp/Test.kgstudio', serialized, bridge);
  expect(bridge.saveProject).toHaveBeenCalledWith('/tmp/Test.kgstudio', serialized);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- src/core/io/KGProjectStorage.test.ts src/bridge/projectBridge.test.ts`

Expected: FAIL until the desktop path exists.

- [ ] **Step 3: Implement Rust commands and TS adapter**

Commands must resolve only `project.json` beneath the supplied `.kgstudio` directory and use `atomic_write_text`.

- [ ] **Step 4: Add backward-compatibility test using the current project upgrader**

Load a fixture at structure version 16 through existing `KGProjectStorage`/upgrader logic and assert the resulting object reports `KGProject.CURRENT_PROJECT_STRUCTURE_VERSION`.

- [ ] **Step 5: Run all project/storage tests and commit**

```bash
npm run test:run -- src/core/io/KGProjectStorage.test.ts src/bridge/projectBridge.test.ts
cargo test --manifest-path src-tauri/Cargo.toml

git add src/bridge src-tauri/src/commands src/core/io/KGProjectStorage.ts src/core/io/KGProjectStorage.test.ts
git commit -m "feat: bridge KG projects to native workspace storage"
```

---

### Task 5: Add desktop smoke E2E and CI/build verification

**Files:**
- Create: `src/test/browser/desktop-bridge.spec.ts`
- Modify: `README.md`
- Modify: `.github/workflows/*` only if the repository already has a build/test workflow suitable for extension.

**Interfaces:**
- Consumes `RuntimeBridge` and project commands from Tasks 2–4.
- Produces documented developer commands and one smoke test proving the app still renders with the bridge boundary.

- [ ] **Step 1: Write the smoke test**

```ts
test('main DAW renders with runtime bridge available', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/K\.G\.?Studio/i);
});
```

- [ ] **Step 2: Run browser test**

Run: `npm run test:browser -- src/test/browser/desktop-bridge.spec.ts`

Expected: PASS after starting the configured preview/dev server according to existing Playwright setup.

- [ ] **Step 3: Document desktop commands**

Add exact commands:

```bash
npm install
npm run tauri:dev
npm run test:run
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

- [ ] **Step 4: Run the milestone gate**

```bash
npm run lint
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md src/test/browser .github/workflows
git commit -m "test: verify desktop foundation end to end"
```
