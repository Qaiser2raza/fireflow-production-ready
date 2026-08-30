export type ProviderResolutionInput = {
    restaurantId: string;
    paymentMethod: string;
};

export type ProviderResolutionResult = {
    providerType: string;
    source: 'ENV' | 'DEFAULT';
};

export function resolveProvider(input: ProviderResolutionInput): ProviderResolutionResult {
    const method = String(input.paymentMethod || '').toUpperCase();
    const envJazzCashEnabled = Boolean(process.env.JAZZCASH_MERCHANT_ID);

    if (method === 'CASH') {
        return { providerType: 'MOCK_PAYMENT', source: 'DEFAULT' };
    }

    if (method === 'JAZZCASH' && envJazzCashEnabled) {
        return { providerType: 'JAZZCASH', source: 'ENV' };
    }

    return { providerType: 'MOCK_PAYMENT', source: 'DEFAULT' };
}
