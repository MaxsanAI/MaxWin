import { Env, json } from "../auth/_shared";

// Promotional spins must never be consumed in a demo game. Welcome and recurring
// spins are now credited to Temple of Ra's server-side Real Play feature balance.
export const onRequestGet: PagesFunction<Env> = async () =>
  json({ error: "Free spins are available only in Temple of Ra Real Play, never in Demo mode." }, 403);

export const onRequestPost: PagesFunction<Env> = async () =>
  json({ error: "Free spins are available only in Temple of Ra Real Play, never in Demo mode." }, 403);
