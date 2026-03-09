CREATE TABLE IF NOT EXISTS yookassa_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_payment_id VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  payer_name VARCHAR(191) NULL,
  payer_email VARCHAR(191) NULL,
  tariff_name VARCHAR(191) NULL,
  lessons_count INT NULL,
  metadata JSON NULL,
  raw_payload JSON NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_yookassa_provider_payment (provider_payment_id),
  KEY idx_yookassa_status_created (status, created_at),
  KEY idx_yookassa_paid_at (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
