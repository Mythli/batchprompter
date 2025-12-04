import { Hono, Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { BuildScraperFunction } from '../lib/AiWebsiteInfoScraper.js';
import { BookingFormStyler, StylingIterationResult, StylingProcessResult } from '../lib/BookingFormStyler.js';
import { EventTracker } from '../lib/EventTracker.js';

type BuildBookingFormStyler = (eventTracker: EventTracker) => BookingFormStyler;

export interface RegisterStyleBookingFormDependencies {
    app: Hono<any>;
    buildInfoScraper: BuildScraperFunction;
    buildStyler: BuildBookingFormStyler;
}

// Define a Zod schema that works for both JSON bodies and query parameters.
const styleBookingFormSchema = z.object({
    bookingFormUrl: z.string().url(),
    bookingFormIntegratedUrl: z.string().url(),
    referenceWebsiteUrl: z.string().url(),
    maxIterations: z.coerce.number().min(0).max(5).optional().default(3),
    stopThreshold: z.coerce.number().min(1).max(10).optional().default(8),
    failureThreshold: z.coerce.number().min(1).max(10).optional().default(3),
    stream: z.coerce.boolean().optional().default(false),
}).refine(data => data.failureThreshold < data.stopThreshold, {
    message: "failureThreshold must be less than stopThreshold",
    path: ["failureThreshold"],
});

type StyleBookingFormInput = z.infer<typeof styleBookingFormSchema>;

// Schema to find a contact page
const contactPageSchema = z.object({
    contactPageUrl: z.string().url().optional()
        .describe("The absolute URL of the contact page.")
});
type ParsedContactPageInfo = z.infer<typeof contactPageSchema>;


/**
 * Registers GET and POST routes to handle styling a booking form based on a reference website.
 * @param deps - The dependencies for the route, including the Hono app instance and the info scraper.
 */
export function registerStyleBookingFormRoute(deps: RegisterStyleBookingFormDependencies) {
    const { app, buildInfoScraper, buildStyler } = deps;

    const styleBookingFormHandler = async (c: Context, body: StyleBookingFormInput) => {
        const eventTracker = new EventTracker();
        if (body.stream) {
            eventTracker.startPerformanceLogging(body.referenceWebsiteUrl);
        }

        const styleAction = async () => {
            const infoScraper = buildInfoScraper(eventTracker);
            const styler = buildStyler(eventTracker);

            let referenceUrls: string[];

            // 1. Try to find a contact page to use as the primary, high-quality reference.
            try {
                const scrapingInstruction = `Your goal is to find the URL for the contact page. This page is often the best reference for forms and button styles. Look for links with text like 'Contact', 'Kontakt', or 'Contact Us'. If you cannot find a contact page, do not return a URL.`;

                const pageInfo: ParsedContactPageInfo = await infoScraper.scrapeInfo(
                    body.referenceWebsiteUrl,
                    contactPageSchema,
                    scrapingInstruction,
                );

                if (pageInfo.contactPageUrl) {
                    referenceUrls = [pageInfo.contactPageUrl];
                } else {
                    referenceUrls = [body.referenceWebsiteUrl];
                }
            } catch (error) {
                referenceUrls = [body.referenceWebsiteUrl];
            }

            const uniqueReferenceUrls = [...new Set(referenceUrls)];

            // 2. Instantiate and run the styler
            const result = await styler.style({
                bookingFormUrl: body.bookingFormUrl,
                bookingFormIntegratedUrl: body.bookingFormIntegratedUrl,
                referenceUrls: uniqueReferenceUrls,
                maxIterations: body.maxIterations,
                stopThreshold: body.stopThreshold,
                failureThreshold: body.failureThreshold,
            });

            return result;
        };

        const getFailureReason = (result: StylingProcessResult): string => {
            if (result.isSuccess) {
                return "Styling was successful, but no CSS was generated.";
            }
            let reason = "Styling failed to produce a satisfactory result.";
            if (result.iterations.length > 0) {
                const bestIteration = result.iterations
                    .filter(it => it.verification.score)
                    .reduce((best, current) =>
                        (!best || current.verification.score > best.verification.score) ? current : best,
                        null as StylingIterationResult | null
                    );

                if (bestIteration) {
                     reason = `Styling did not meet the required quality threshold. Best score was ${bestIteration.verification.score}. Last feedback: ${bestIteration.verification.feedback}`;
                } else {
                     reason = "Styling failed, and no iterations could be successfully verified.";
                }
            }
            return reason;
        };

        if (body.stream) {
            return eventTracker.streamSse(c, async () => {
                const result = await styleAction();
                if (result.isSuccess) {
                    // On success, the 'done' event payload is the CSS string.
                    return result.finalCss ?? '';
                }
                // On failure, throw an error with the reason, which will be sent in an 'error' event.
                throw new Error(getFailureReason(result));
            });
        }

        try {
            const result = await styleAction();
            if (result.isSuccess) {
                c.header('Content-Type', 'text/css');
                return c.body(result.finalCss ?? '');
            } else {
                const reason = getFailureReason(result);
                return c.json({
                    error: "Styling failed",
                    message: reason,
                    result: result
                }, 422);
            }

        } catch (error: any) {
            return c.json({
                error: "An unexpected error occurred during the styling process.",
                message: error.message || 'Unknown error'
            }, 500);
        }
    };

    app.post(
        '/style-booking-form',
        zValidator('json', styleBookingFormSchema),
        async (c) => {
            const body = c.req.valid('json');
            return styleBookingFormHandler(c, body);
        }
    );

    app.get(
        '/style-booking-form',
        zValidator('query', styleBookingFormSchema),
        async (c) => {
            const body = c.req.valid('query');
            return styleBookingFormHandler(c, body);
        }
    );
}
