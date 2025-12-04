// src/lib/fetchAndConvertUrls.spec.ts

// --- Imports ---
import { processCssAndInlineUrls } from './processCssAndInlineUrls.js';

// --- Mock Setup ---
const mockedFetchAndCreateDataUri = jest.fn();


describe('processCssAndInlineUrls', () => {
    const inputCss = ` 
        #header-image {
        background-image: url(files/themes/pa-bremen/images/seekarte-deutschland-wsv.jpg);
        }`;
    const cssBaseUrl = 'https://pa-bremen.de';
    const mockedDataUri = 'data:image/jpeg;base64,MOCKED_IMAGE_CONTENT';

    beforeEach(() => {
        mockedFetchAndCreateDataUri.mockClear();
    });

    it('should replace a relative background-image url with a data URI', async () => {
        // Arrange
        mockedFetchAndCreateDataUri.mockResolvedValue(mockedDataUri);

        // Act
        const outputCss = await processCssAndInlineUrls(inputCss, cssBaseUrl, mockedFetchAndCreateDataUri);

        // Assert
        const expectedAbsoluteUrl = 'https://pa-bremen.de/files/themes/pa-bremen/images/seekarte-deutschland-wsv.jpg';
        expect(mockedFetchAndCreateDataUri).toHaveBeenCalledTimes(1);
        expect(mockedFetchAndCreateDataUri).toHaveBeenCalledWith(expectedAbsoluteUrl);
        expect(outputCss).toContain(`url(${mockedDataUri})`);
    });
});
