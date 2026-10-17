import { PRODUCT_CREDITS } from "@/lib/credits";

export function SiteCredits() {
  return (
    <footer className="mt-auto border-t border-zinc-200 px-6 py-5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Credits</h2>
        {PRODUCT_CREDITS.map((credit) => (
          <p key={credit.id}>
            {credit.text}
            {credit.links?.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="ml-2 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {link.label}
              </a>
            ))}
          </p>
        ))}
      </div>
    </footer>
  );
}
