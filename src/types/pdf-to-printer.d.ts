declare module 'pdf-to-printer' {
    export interface PrintOptions {
        printer?: string;
        pages?: string;
        subset?: string;
        orientation?: string;
        scale?: string;
        monochrome?: boolean;
        side?: string;
        bin?: string;
        paperSize?: string;
        silent?: boolean;
        printDialog?: boolean;
        copies?: number;
    }

    export function print(pdf: string, options?: PrintOptions): Promise<void>;
    export function getPrinters(): Promise<string[]>;
    export function getDefaultPrinter(): Promise<string | null>;
}
