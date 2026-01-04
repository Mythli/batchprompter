export class GenericFetchHandler {
    name = 'generic-fetch';
    async handle(url, services) {
        const response = await services.fetcher(url);
        if (!response.ok) {
            throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    }
}
//# sourceMappingURL=GenericFetchHandler.js.map