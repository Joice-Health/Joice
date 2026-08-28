import { Eyebrow } from './eyebrow';

/**
 * L2-page opener, centred like the deck: mono eyebrow → condensed uppercase
 * title → one supporting line in the text face. The eyebrow is optional for
 * pages whose title says it all (the shop).
 */
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="py-16 text-center sm:py-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center animate-fade-up">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className={`display text-balance text-5xl text-ink sm:text-7xl${eyebrow ? ' mt-6' : ''}`}>
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
