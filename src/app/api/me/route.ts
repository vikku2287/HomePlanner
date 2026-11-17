import { NextResponse } from "next/server";
import { currentUser, publicUser } from "@/lib/session";
import { familyChannel, formatInviteCode, getStore } from "@/lib/store";

/** Who is signed in, their family, and how their device should listen for changes. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null, family: null });
  const family = user.familyId ? await getStore().getFamily(user.familyId) : null;
  const realtime =
    family && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
      ? { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, channel: familyChannel(family) }
      : null;
  return NextResponse.json({
    user: publicUser(user),
    family: family && {
      id: family.id,
      name: family.name,
      timeZone: family.timeZone,
      inviteCode: formatInviteCode(family.inviteCode),
    },
    realtime,
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
