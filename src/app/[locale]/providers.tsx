"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode } from "react";
import { CommandPalette } from "~/components/search/command-palette";
import type { Locale } from "~/i18n/config";
import { CountryProvider } from "~/lib/hooks/useCountry";
import { getDefaultLanguageMarketOption } from "~/lib/locale/locales";
import { ThemeProvider } from "~/lib/providers/theme-provider";

export function Providers({
  children,
  initialCountryAlpha2,
  locale,
  messages,
  timeZone,
}: {
  children: ReactNode;
  initialCountryAlpha2?: string | null;
  locale: Locale;
  messages: AbstractIntlMessages;
  timeZone: string;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      <ThemeProvider attribute="class" defaultTheme="system">
        <CountryProvider
          initialCountryAlpha2={initialCountryAlpha2}
          initialLocaleId={getDefaultLanguageMarketOption(locale).localeId}
        >
          <NuqsAdapter>
            {children}
            {/* Mount a single global Command Palette so ⌘K/Ctrl+K works app-wide */}
            <CommandPalette />
          </NuqsAdapter>
        </CountryProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
