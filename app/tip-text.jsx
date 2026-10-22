import { ListenButton } from './speech.jsx';

/**
 * A unit's tip: its words in the person's own language, then its examples in
 * the language learned, each with its sound in Latin letters where the
 * language has its own script, its meaning, and Listen where a voice can read it.
 *
 * @param {{ tip: { title: string, body: string, examples: { text: string, roman: string, meaning: string }[] }, code: string, own: string, speak?: boolean }} props
 */
export function TipText({ tip, code, own, speak = true }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {tip.body.split(/\n{2,}/u).map((paragraph, at) => (
        <p key={at} lang={own} className="whitespace-pre-line leading-relaxed">
          {paragraph}
        </p>
      ))}
      <ul className="flex flex-col gap-2">
        {tip.examples.map((example, at) => (
          <li key={at} className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
            {speak && <ListenButton text={example.text} />}
            <div className="min-w-0">
              <p lang={code} className="text-base font-semibold">
                {example.text}
              </p>
              {example.roman !== '' && <p className="text-sm text-muted-foreground">{example.roman}</p>}
              <p lang={own} className="text-sm text-muted-foreground">
                {example.meaning}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
