package config

import (
	"github.com/spf13/viper"
)

type Config struct {
	Database struct {
		User     string `mapstructure:"User"`
		Password string `mapstructure:"Password"`
		Host     string `mapstructure:"Host"`
		DBName   string `mapstructure:"DBName"`
	} `mapstructure:"Database"`

	Redis struct { // NEW
		Host     string `mapstructure:"Host"`
		Password string `mapstructure:"Password"`
		DB       int    `mapstructure:"DB"`
	} `mapstructure:"Redis"`

	ApiSecrets struct {
		GiftSecret    string `mapstructure:"GiftSecret"`
		CaptchaApiKey string `mapstructure:"CaptchaApiKey"`
		JwtSecret     string `mapstructure:"JwtSecret"`
	} `mapstructure:"ApiSecrets"`

	Game struct {
		TargetState int `mapstructure:"TargetState"`
	} `mapstructure:"Game"`

	Discord struct {
		WebhookURL      string `mapstructure:"WebhookUrl"`
		ChannelId       string `mapstructure:"ChannelId"`
		AnnounceTimeUTC string `mapstructure:"AnnounceTimeUTC"`
		AnnounceDay     string `mapstructure:"AnnounceDay"`
	} `mapstructure:"Discord"`

	Rotation struct {
		SeasonReferenceDate string `mapstructure:"SeasonReferenceDate"`
	} `mapstructure:"Rotation"`

	BioID struct {
		ApplicationName   string `mapstructure:"ApplicationName"`
		ApplicationDomain string `mapstructure:"ApplicationDomain"`
		ApplicationURL    string `mapstructure:"ApplicationUrl"`
	} `mapstructure:"BioID"`
}

func LoadConfig() (*Config, error) {
	viper.SetConfigFile("appsettings.json")
	viper.SetConfigType("json")
	viper.SetDefault("Game.TargetState", 391)

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
