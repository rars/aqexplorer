import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { enGB } from 'date-fns/locale';

import { routes } from './app.routes';
import { DuckDbService } from './services/duckdb/duck-db';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    { provide: MAT_DATE_LOCALE, useValue: enGB },
    provideDateFnsAdapter(),
    {
      provide: APP_BASE_HREF,
      useFactory: (platformLocation: PlatformLocation) => platformLocation.getBaseHrefFromDOM(),
      deps: [PlatformLocation],
    },
    provideAppInitializer(() => {
      const duckDbService = inject(DuckDbService);
      const baseHref = inject(APP_BASE_HREF, { optional: true }) || '/';
      const cleanBaseHref = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
      console.log(`Base href: ${cleanBaseHref}`);
      const fileUrl = window.location.origin + cleanBaseHref + 'pm2.5.parquet';
      return duckDbService.initDatabase(fileUrl);
    }),
  ],
};
