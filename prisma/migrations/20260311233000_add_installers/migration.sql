-- CreateTable
CREATE TABLE `installers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `coverage` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `installers_phone_key`(`phone`),
    INDEX `installers_branch_idx`(`branch`),
    INDEX `installers_region_idx`(`region`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
