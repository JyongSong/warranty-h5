ALTER TABLE `warranty_registrations`
    ADD COLUMN `install_type` VARCHAR(191) NOT NULL DEFAULT 'installer' AFTER `sn`,
    MODIFY `installer_phone` VARCHAR(191) NULL;
