import { getDevices } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async () => {
  try {
    const res = await getDevices();
    return { devices: res.devices, error: null };
  } catch (err) {
    return {
      devices: [],
      error: err instanceof Error ? err.message : "デバイス一覧の読み込みに失敗しました",
    };
  }
};
