import type { Page } from 'puppeteer';

/**
 * Moves an open Gmail thread to the trash.
 *
 * The selectors cover Gmail's English and German toolbar labels. The structural
 * data-tooltip fallback also works when aria-label is omitted by a Gmail rollout.
 */
export async function trashThread(page: Page, threadId: string): Promise<void> {
  await page.waitForSelector('.a3s', { timeout: 15000 });

  const deleteButtonSelector = [
    'div[role="button"][act="10"]',
    'div[role="button"][aria-label^="Delete"]',
    'div[role="button"][aria-label^="Löschen"]',
    'div[role="button"][title^="Delete"]',
    'div[role="button"][title^="Löschen"]',
    'div[role="button"][data-tooltip^="Delete"]',
    'div[role="button"][data-tooltip^="Löschen"]'
  ].join(', ');

  try {
    await page.waitForSelector(deleteButtonSelector, { visible: true, timeout: 10000 });
  } catch {
    const visibleButtons = await page.$$eval('div[role="button"]', (buttons) => {
      return buttons
        .filter((element) => {
          const htmlElement = element as HTMLElement;
          return htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0;
        })
        .map((element) => ({
          ariaLabel: element.getAttribute('aria-label'),
          tooltip: element.getAttribute('data-tooltip'),
          act: element.getAttribute('act'),
          title: element.getAttribute('title'),
          className: element.getAttribute('class')
        }))
        .slice(0, 40);
    });

    throw new Error(
      `Could not locate the Gmail delete button. Visible buttons: ${JSON.stringify(visibleButtons)}`
    );
  }

  const buttons = await page.$$(deleteButtonSelector);
  let clicked = false;

  for (const button of buttons) {
    const isVisible = await button.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      return htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0;
    });

    if (isVisible) {
      await button.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    throw new Error('Could not find a visible Gmail delete button.');
  }

  await page.waitForFunction(
    (deletedThreadId) => !window.location.hash.includes(deletedThreadId),
    { timeout: 10000 },
    threadId
  );

  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
}
