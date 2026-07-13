import { Eyebrow } from './eyebrow';

/** Standard L2-page opener: eyebrow → display title → supporting line. */
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="py-16 sm:py-24">
      <div className="animate-fade-up">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-2xl text-balance text-5xl leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl">
          {title}
        </h1>
        {children ? (
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            {children}
          </p>
        ) : null}
      </div>
    </section>
  );
}
