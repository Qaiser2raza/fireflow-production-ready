import { useState, useCallback } from 'react';
import { TableOperations } from '../components/services/tableOperations';
import { ApiService } from '../components/services/apiService';
import { useAppContext } from '../App';
import { Table, Reservation } from '../types';

export const useTableOperations = () => {
    const { fetchInitialData, reservations, currentUser, tables } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateTableCapacity = useCallback(async (
        tableId: string,
        newCapacity: number
    ) => {
        setIsLoading(true);
        setError(null);

        try {
            if (newCapacity < 1 || newCapacity > 20) {
                throw new Error('Capacity must be between 1 and 20');
            }

            await ApiService.updateTable(tableId, { capacity: newCapacity });
            // Optimistic update could go here, but for now we sync
            await fetchInitialData();
            return true;
        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [fetchInitialData]);

    const checkConflict = useCallback((tableId: string) => {
        return TableOperations.checkReservationConflict(tableId, reservations || [], 20);
    }, [reservations]);

    const mergeTables = useCallback(async (
        tableIds: string[],
        sectionId: string
    ) => {
        setIsLoading(true);
        setError(null);

        try {
            // 1. Validation
            const targetTables = tables.filter(t => tableIds.includes(t.id));
            const validation = TableOperations.validateMerge(targetTables);
            if (!validation.isValid) throw new Error(validation.errors[0]);

            // 2. Execution
            const mergeId = `merge-${Date.now()}-${sectionId}`;
            await ApiService.mergeTables(tableIds, mergeId);
            await fetchInitialData();
            return mergeId;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [tables, fetchInitialData]);

    return {
        updateTableCapacity,
        mergeTables,
        checkConflict,
        isLoading,
        error,
        clearError: () => setError(null)
    };
};
