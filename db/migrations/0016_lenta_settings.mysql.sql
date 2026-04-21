CREATE TABLE IF NOT EXISTS lenta_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  acquiring_percent DECIMAL(6,3) NOT NULL DEFAULT 3.5,
  tax_percent DECIMAL(6,3) NOT NULL DEFAULT 4.0,
  fund_development_percent DECIMAL(6,3) NOT NULL DEFAULT 40.0,
  fund_safety_percent DECIMAL(6,3) NOT NULL DEFAULT 30.0,
  fund_dividends_percent DECIMAL(6,3) NOT NULL DEFAULT 30.0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lenta_settings (
  id,
  acquiring_percent,
  tax_percent,
  fund_development_percent,
  fund_safety_percent,
  fund_dividends_percent
)
VALUES (1, 3.5, 4.0, 40.0, 30.0, 30.0)
ON DUPLICATE KEY UPDATE
  acquiring_percent = VALUES(acquiring_percent),
  tax_percent = VALUES(tax_percent),
  fund_development_percent = VALUES(fund_development_percent),
  fund_safety_percent = VALUES(fund_safety_percent),
  fund_dividends_percent = VALUES(fund_dividends_percent);
