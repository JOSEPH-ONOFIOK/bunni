import { ClaimPortal } from "@/components/ClaimPortal";

export const metadata = {
  title: "Claim your spot",
  description:
    "Free-mint spots for holders. Pick your community, enter the wallet that holds it, and the spot is yours.",
};

// The claim reads live counts and snapshots, so it must never be prerendered
// into a stale page.
export const dynamic = "force-dynamic";

export default function Claim() {
  return (
    <main
      className="min-h-[100svh] px-5 py-10 sm:py-14"
      style={{
        background:
          "linear-gradient(to bottom, #bfe4ff 0%, #d8f0dd 46%, #fdf8ec 100%)",
      }}
    >
      <ClaimPortal />
    </main>
  );
}
