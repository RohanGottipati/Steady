import { SiteShell } from "@/components/product/layout/SiteShell";
import { SiteCredits } from "@/components/site-credits";

export const metadata = { title: "Licenses & notices — Steady" };

export default function NoticesPage() {
  return <SiteShell><main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
    <h1 className="mb-8 text-3xl font-semibold">Licenses & notices</h1>
    <SiteCredits />
  </main></SiteShell>;
}
