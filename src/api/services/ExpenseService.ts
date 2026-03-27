import { prisma } from '../../shared/lib/prisma';
import { journalEntryService } from './JournalEntryService';
import { Decimal } from '@prisma/client/runtime/library';

export class ExpenseService {
    async createExpense(data: {
        restaurantId: string;
        category: "UTILITIES" | "SALARY" | "MAINTENANCE" | "SUPPLIES" | "MARKETING" | "RENT" | "TRANSPORT" | "MISCELLANEOUS";
        amount: number;
        description: string;
        processedBy: string;
    }, tx?: any) {
        const db = tx || prisma;

        const expense = await db.expenses.create({
            data: {
                restaurant_id: data.restaurantId,
                category: data.category,
                amount: new Decimal(data.amount.toString()),
                description: data.description,
                processed_by: data.processedBy
            }
        });

        await journalEntryService.recordExpenseJournal({
            restaurantId: data.restaurantId,
            expenseId: expense.id,
            amount: data.amount,
            description: data.description,
            processedBy: data.processedBy
        }, db);

        return expense;
    }
}
