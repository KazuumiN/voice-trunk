import type { MountInfo, BatchState, ImportProgress } from "./types";
import * as commands from "./tauri";
import type { UnlistenFn } from "@tauri-apps/api/event";

// Svelte 5: use an object with $state properties so we can export + mutate
function createAppStore() {
  let connectedDevices = $state<MountInfo[]>([]);
  let activeBatches = $state<Record<string, BatchState>>({});
  let serverConnected = $state<boolean>(false);
  let currentImportBatchId = $state<string | null>(null);
  let importProgress = $state<ImportProgress | null>(null);
  let unlisteners: UnlistenFn[] = [];

  return {
    get connectedDevices() { return connectedDevices; },
    set connectedDevices(v: MountInfo[]) { connectedDevices = v; },
    get activeBatches() { return activeBatches; },
    set activeBatches(v: Record<string, BatchState>) { activeBatches = v; },
    get serverConnected() { return serverConnected; },
    set serverConnected(v: boolean) { serverConnected = v; },
    get currentImportBatchId() { return currentImportBatchId; },
    set currentImportBatchId(v: string | null) { currentImportBatchId = v; },
    get importProgress() { return importProgress; },
    set importProgress(v: ImportProgress | null) { importProgress = v; },

    async init() {
      try {
        connectedDevices = await commands.scanVolumes();
      } catch {
        connectedDevices = [];
      }

      try {
        activeBatches = await commands.getBatches();
      } catch {
        activeBatches = {};
      }

      try {
        const config = await commands.getConfig();
        serverConnected = !!config.serverUrl;
      } catch {
        serverConnected = false;
      }

      unlisteners.push(
        await commands.onMountDetected((mount) => {
          if (!connectedDevices.find((d) => d.path === mount.path)) {
            connectedDevices = [...connectedDevices, mount];
          }
        }),
      );

      unlisteners.push(
        await commands.onMountRemoved(({ path }) => {
          connectedDevices = connectedDevices.filter((d) => d.path !== path);
        }),
      );

      unlisteners.push(
        await commands.onImportProgress((progress) => {
          importProgress = progress;
          currentImportBatchId = progress.batchId;
        }),
      );
    },

    cleanup() {
      for (const unlisten of unlisteners) {
        unlisten();
      }
      unlisteners = [];
    },
  };
}

export const appStore = createAppStore();
