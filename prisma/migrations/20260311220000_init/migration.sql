-- CreateTable
CREATE TABLE `shipped_devices` (
    `id` VARCHAR(191) NOT NULL,
    `sn` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NULL,
    `shipped_date` VARCHAR(191) NULL,
    `batch_id` VARCHAR(191) NULL,

    UNIQUE INDEX `shipped_devices_sn_key`(`sn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warranty_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `sn` VARCHAR(191) NOT NULL,
    `install_date` VARCHAR(191) NOT NULL,
    `user_phone` VARCHAR(191) NOT NULL,
    `installer_phone` VARCHAR(191) NOT NULL,
    `consent_privacy` BOOLEAN NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'submitted',
    `confirm_token` VARCHAR(191) NULL,
    `confirm_token_expires_at` DATETIME(3) NULL,
    `free_as_end_date` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmed_at` DATETIME(3) NULL,
    `confirmed_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `warranty_registrations_sn_key`(`sn`),
    UNIQUE INDEX `warranty_registrations_confirm_token_key`(`confirm_token`),
    INDEX `warranty_registrations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
