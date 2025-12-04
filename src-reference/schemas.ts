import { z } from 'zod';

const hexColorRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/;
const urlRegex = /^https?:\/\/.+/;


// Reusable Address Schema
const AddressSchema = z.object({
    streetAddress: z.string().min(1).optional().describe("Street name and number (e.g., '1600 Amphitheatre Parkway')."),
    city: z.string().min(1).optional().describe("City."),
    stateProvince: z.string().min(1).optional().describe("State or province (e.g., 'CA', 'California', 'Ontario')."),
    postalCode: z.string().min(1).optional().describe("Postal or ZIP code."),
    country: z.string()
        .length(2, "Country code must be exactly 2 characters long.") // Enforce length of 2
        .regex(/^[A-Z]{2}$/, "Country code must be 2 uppercase letters (e.g., US, CA, GB).") // Enforce 2 uppercase letters
        .optional()
        .describe("Country. ISO 3166-1 alpha-2 codes (e.g., US, CA, GB).") // Updated description
}).describe("Physical address of the company."); // The entire address object can be optional

const Offer = z.object({
    title: z.string().describe("The title or name of a concrete product or service which can be booked with a booking system which is made for courses, seminars, events and scheduling."),
    description: z.string().describe("A 1 paragraph (~300 character) description of the product or service that matches the title."),
    price: z.number().optional().describe("The price of the offer"),
});

// CEO Schema
const CEOSchema = z.object({
    firstName: z.string().min(1).optional().describe("The first name of the CEO."),
    lastName: z.string().min(1).optional().describe("The last name of the CEO."),
    email: z.string().email().optional().describe("The corporate email address of the CEO."),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional().describe("The corporate phone number of the CEO."),
}).describe("Details about the company's main executive (can be ceo, president, owner, ...)."); // The entire CEO object can be optional

// Company Schema
const CompanySchema = z.object({
    id: z.string().min(1).optional().describe("A unique identifier for the company (e.g., internal ID, registration number, stock ticker, UUID)."),
    vatId: z.string().min(1).optional().describe("The company's official Value Added Tax (VAT) identification number, used for tax purposes and often required for business transactions within specific jurisdictions (e.g., EU countries)."),
    legalName: z.string().min(1).optional().describe("The full legal registered name of the company"),
    currency: z.string().optional().describe("The currency the company likely works with in ISO 4217 format (e.g., 'USD', 'EUR')."),
    address: AddressSchema, // AddressSchema itself is defined as optional
    contactInformation: z.object({
        email: z.string().email().optional().describe("General contact email address for the company."),
        phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional().describe("General contact phone number for the company.")
    }).optional().describe("General contact information for the company."), // The entire contactInformation object can be optional
}).describe("Details about the company."); // The entire Company object can be optional

// Main Schema combining Company and CEO
export const companyParsingSchema = z.object({
    company: CompanySchema.optional(), // CompanySchema itself is defined as optional
    mainExecutive: CEOSchema.optional(),
    sampleOffer: Offer.optional().describe("A concrete sample product in the language (german, english, ...) which is a good example offer of the core business the company is doing. The product must be bookable through a booking system made for courses, events, workshops or scheduling."),
    websiteInfo: z.object({
        privacyUrl: z.string().regex(urlRegex, "Must be a valid URL starting with http:// or https://").optional().describe("The url which holds the companies privacy policy."),
        imprintUrl: z.string().regex(urlRegex, "Must be a valid URL starting with http:// or https://").optional().describe("The url which holds the companies imprint."),
        contactUrl: z.string().regex(urlRegex, "Must be a valid URL starting with http:// or https://").optional().describe("The url which can be used to contact the company (contact page, no email)"),
    }).optional()
}).describe("Schema for common company and Chief Executive Officer (CEO) details.");

export type ParsedCompanyInfo = z.infer<typeof companyParsingSchema>

export const lowContentPageSchema = z.object({
    websiteInfo: z.object({
        privacyUrl: z.string().regex(urlRegex, "Must be a valid URL starting with http:// or https://").optional().describe("The url which holds the companies privacy policy."),
        imprintUrl: z.string().regex(urlRegex, "Must be a valid URL starting with http:// or https://").optional().describe("The url which holds the companies imprint."),
        contactUrl: z.string().regex(urlRegex, "Must be a valid URL starting with http:// or https://").optional().describe("The url which can be used to contact the company (contact page, no email)"),
    }).optional()
}).describe("Schema for finding low-content pages like privacy, imprint, or contact pages.");

export type ParsedLowContentPageInfo = z.infer<typeof lowContentPageSchema>;

export const linkScrapingSchema = z.object({
    scrapingLinks: z.array(z.string().url("Must be a valid URL"))
        .max(3)
        .describe("An array of URLs to scrape for more information.")
});
