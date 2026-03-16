
import { useCallback } from 'react';
import { useAppContext } from '../client/contexts/AppContext';

export const useThermalPrinter = () => {
    const { addNotification, operationsConfig } = useAppContext();

    const printReceipt = useCallback(async (htmlContent: string) => {
        const isElectron = !!(window as any).electron;
        
        if (!isElectron) {
            // Fallback to browser print if not in Electron
            console.warn('Thermal print requested outside Electron environment. Falling back to window.print()');
            window.print();
            return;
        }

        try {
            const printerName = operationsConfig?.primary_printer || 'Default';
            const showDialog = operationsConfig?.print_dialog ?? false;

            console.log(`[ThermalPrinter] Sending print request to ${printerName} (Dialog: ${showDialog})`);

            const result = await (window as any).electron.ipcRenderer.invoke('print-thermal', {
                html: htmlContent,
                printerName,
                silent: !showDialog
            });

            // result is expected to be { success: boolean, error?: string }
            if (result && result.success) {
                addNotification('success', `Sent to printer: ${printerName}`);
            } else {
                const errorMsg = result?.error || 'Unknown printer error';
                console.error('[ThermalPrinter] Print failed:', errorMsg);
                addNotification('error', `Print failed: ${errorMsg}. Please check if printer "${printerName}" is connected and correct in Settings.`);
                // Fallback to browser print if thermal fails
                window.print();
            }
        } catch (err: any) {
            console.error('Thermal print error:', err);
            addNotification('error', `Print failed: ${err.message}`);
            // Last resort fallback
            window.print();
        }
    }, [operationsConfig, addNotification]);

    return { printReceipt };
};
