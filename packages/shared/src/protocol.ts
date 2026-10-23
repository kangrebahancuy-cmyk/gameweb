import { z } from 'zod';
import type { ClientAction } from './types';

const num = z.number().finite();
const id = z.string().min(1).max(48);

/** Runtime validation of every message a client may send. Anything else is rejected by the room. */
export const ClientActionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('input'), dx: num.min(-1).max(1), dy: num.min(-1).max(1), run: z.boolean(), seq: z.number().int().min(0) }),
  z.object({ t: z.literal('farm'), op: z.enum(['till', 'plant', 'harvest']), tx: z.number().int(), ty: z.number().int(), seed: id.optional() }),
  z.object({ t: z.literal('attack'), target: id }),
  z.object({ t: z.literal('talk'), npc: id }),
  z.object({ t: z.literal('shop'), npc: id, op: z.enum(['buy', 'sell']), item: id, qty: z.number().int().min(1).max(999) }),
  z.object({ t: z.literal('expand_farm') }),
  z.object({ t: z.literal('rest') }),
  z.object({ t: z.literal('chat'), text: z.string().max(200) }),
]);

export const JoinSchema = z.object({
  t: z.literal('join'),
  token: z.string().min(1).max(4096),
  name: z.string().trim().min(3).max(16).regex(/^[A-Za-z0-9_ -]+$/).optional(),
});
export type Join = z.infer<typeof JoinSchema>;

// compile-time guarantee that the schema and the hand-written type agree
type Parsed = z.infer<typeof ClientActionSchema>;
const _assert: (a: Parsed) => ClientAction = (a) => a;
void _assert;
