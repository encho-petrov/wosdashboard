CREATE TABLE IF NOT EXISTS buildings (
    id INT NOT NULL AUTO_INCREMENT,
    internal_id INT NOT NULL,
    type ENUM('Fortress', 'Stronghold') NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (internal_id, type)
);

