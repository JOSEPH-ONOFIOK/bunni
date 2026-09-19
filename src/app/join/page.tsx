import Image from "next/image";
import Link from "next/link";
import { JoinForm } from "@/components/JoinForm";
import { BUNNIES } from "@/lib/bunnies";
import { currentAccount } from "@/lib/x-session";
import { signupsOpen } from "@/lib/allowlist-status";

export const metadata = {
  title: "BUNII — Join the list",
  description:
    "Four steps and a wallet. The free-mint list is the only way to be sure of a spot.",
};

export default async function Join({ searchParams }: PageProps<"/join">) {
  // Reading the session here means the form renders already-connected on the
  // first paint after the OAuth round trip — no mount fetch, no flash.
  const [account, params] = await Promise.all([currentAccount(), searchParams]);

  const configured = Boolean(
    process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET,
  );
  const oauthStatus = typeof params.x === "string" ? params.x : null;

  return (
    <main
      className="min-h-[100svh] px-5 py-12 sm:py-16"
      style={{
        background:
          "linear-gradient(to bottom, #bfe4ff 0%, #d8f0dd 46%, #fdf8ec 100%)",
      }}
    >
      <div className="mx-auto max-w-lg">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/" className="wordmark text-2xl">
            BUNII
          </Link>
          <Link
            href="/"
            className="text-[11px] font-bold text-ink/50 underline underline-offset-2 hover:text-ink"
          >
            Back to the world
          </Link>
        </nav>

        {/* The crew, as a reminder of what the list is for. */}
        <div className="mb-8 flex justify-center -space-x-3">
          {BUNNIES.map((b) => (
            <div
              key={b.id}
              className="h-14 w-14 overflow-hidden rounded-2xl border-[3px] border-ink bg-white"
            >
              <Image
                src={b.src}
                alt=""
                width={120}
                height={120}
                className="h-full w-full object-cover"
                sizes="56px"
              />
            </div>
          ))}
        </div>

        {signupsOpen() ? (
          <JoinForm
            account={{
              configured,
              connected: Boolean(account),
              username: account?.username,
              name: account?.name,
            }}
            oauthStatus={oauthStatus}
          />
        ) : (
          <div className="inked rounded-3xl bg-white p-8 text-center">
            <p className="eyebrow text-ink/45">Doors closed</p>
            <p className="wordmark mt-3 text-4xl">The list is full</p>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink/65">
              Every spot is spoken for. Keep an eye on the world for what
              happens next.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
