-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `invoiceUrl` VARCHAR(191) NULL;
