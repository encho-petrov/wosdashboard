{
  "Database": {
    "User": "<USER>",
    "Password": "<PASSWORD>",
    "Host": "localhost:3306",
    "DBName": "<DB_NAME>"
  },
  "ApiSecrets": {
    "JwtSecret": "<GENERATE A LONG RANDOM TEXT STRING HERE>",
    "GiftSecret": "tB87#kPtkxqOS2",
    "CaptchaApiKey": "<YOUR 2CAPTCHA.COM API KEY>"
  },
  "ProcessorSettings": {
    "MaxWorkers": 5,
    "RetryAttempts": 3
  },
  "Redis": {
    "Host": "localhost:6379",
    "Password": "",
    "DB": 0
  },
  "Game": {
    "TargetState": <YOUR WOS STATE/SERVER ID, EG 391>
  }
}
