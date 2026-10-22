import { Languages } from 'lucide-react';

import { AppMenu } from '@/components/ui/app-menu';
import { PageFrame } from '@/components/ui/page-frame';

import { t } from '../lib/i18n/index.js';

/**
 * Every page's outer shape: the app's name and menu on top, then the kit's
 * page frame with the page's title, actions and counts.
 *
 * `data-tellop-app-marker` is what Tellop's health probe looks for: a page that
 * renders it has really mounted. It stays on the outermost element. `lang` is
 * the person's own language, which the screens are written in; words of the
 * language learned carry their own `lang` where they are shown.
 *
 * @param {{
 *   own: string,
 *   path?: string,
 *   menu?: boolean,
 *   title: React.ReactNode,
 *   description?: React.ReactNode,
 *   actions?: React.ReactNode,
 *   counts?: React.ReactNode,
 *   children: React.ReactNode,
 * }} props
 */
export function Frame({ own, path, menu = true, title, description, actions, counts, children }) {
  return (
    <div data-tellop-app-marker="ok" lang={own} className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <a href="/" className="flex items-center gap-2 rounded-lg py-1 font-heading text-lg font-bold text-primary">
            <Languages aria-hidden="true" className="size-5" />
            {t('app.title', own)}
          </a>
          {menu && <AppMenu locale={own} currentPath={path} />}
        </div>
      </div>
      <PageFrame locale={own} title={title} description={description} actions={actions} counts={counts}>
        {children}
      </PageFrame>
    </div>
  );
}
