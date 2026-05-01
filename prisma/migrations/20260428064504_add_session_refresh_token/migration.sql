-- AlterTable
ALTER TABLE `session` ADD COLUMN `refreshToken` VARCHAR(191) NULL,
    ADD COLUMN `refreshTokenExpires` DATETIME(3) NULL;
