import { getRecording } from "$lib/api/client.js";
import type { PageLoad } from "./$types.js";

export const load: PageLoad = async ({ params }) => {
  try {
    const recording = await getRecording(params.id);
    return { recording, error: null };
  } catch (err) {
    return {
      recording: null,
      error: err instanceof Error ? err.message : "録音の読み込みに失敗しました",
    };
  }
};
