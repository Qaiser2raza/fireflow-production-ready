
import { useCallback } from 'react';
import { useAppContext } from '../client/contexts/AppContext';

const printHtmlBrowserFallback = (html: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
    }
    
    setTimeout(() => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } catch (e) {
            console.error("Browser fallback print failed", e);
        } finally {
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 1000);
        }
    }, 250);
};

export const useThermalPrinter = () => {
    const { addNotification, operationsConfig } = useAppContext();

    const printReceipt = useCallback(async (htmlContent: string) => {
        const isElectron = !!(window as any).electron;
        
        if (!isElectron) {
            // Fallback to browser print if not in Electron
            console.warn('Thermal print requested outside Electron environment. Rendering receipt to hidden iframe.');
            printHtmlBrowserFallback(htmlContent);
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
                printHtmlBrowserFallback(htmlContent);
            }
        } catch (err: any) {
            console.error('Thermal print error:', err);
            addNotification('error', `Print failed: ${err.message}`);
            // Last resort fallback
            printHtmlBrowserFallback(htmlContent);
        }
    }, [operationsConfig, addNotification]);

    return { printReceipt };
};
