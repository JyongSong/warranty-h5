ALTER TABLE `installers`
    ADD COLUMN `install_count` INT NULL AFTER `category`,
    ADD COLUMN `happy_call_lt` INT NULL AFTER `install_count`,
    ADD COLUMN `defect_count` INT NULL AFTER `happy_call_lt`,
    ADD COLUMN `dissatisfaction_note` TEXT NULL AFTER `defect_count`;
