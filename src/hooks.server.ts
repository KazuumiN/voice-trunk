import type { Handle } from "@sveltejs/kit";
import { paraglideMiddleware } from "$lib/paraglide/server.js";

export const handle: Handle = async ({ event, resolve }) => {
  return paraglideMiddleware(event.request, ({ request }) => {
    return resolve(event);
  });
};
