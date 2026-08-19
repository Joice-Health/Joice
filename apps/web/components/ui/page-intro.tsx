import { Eyebrow } from './eyebrow';

/**
 * L2-page opener, centred like the deck: mono eyebrow → condensed uppercase
 * title → one supporting line in the text face.
 */
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
    <section className="py-16 text-center sm:py-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center animate-fade-up">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display mt-6 text-balance text-5xl text-ink sm:text-7xl">{title}</h1>
        {children ? (
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            {children}
          </p>
        ) : null}
      </div>
    </section>
  );
}
