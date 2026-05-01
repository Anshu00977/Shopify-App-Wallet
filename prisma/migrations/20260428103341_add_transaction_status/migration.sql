-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `orderId` VARCHAR(191) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'completed';
