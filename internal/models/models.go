package models

import (
	"encoding/json"
	"fmt"
	"time"
)

type FlexString string

func (fs *FlexString) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		*fs = FlexString(s)
		return nil
	}

	var i int
	if err := json.Unmarshal(data, &i); err == nil {
		*fs = FlexString(fmt.Sprintf("%d", i))
		return nil
	}

	return fmt.Errorf("FlexString: cannot unmarshal %s", string(data))
}

type PlayerData struct {
	Fid      int64      `json:"fid"`
	Nickname string     `json:"nickname"`
	KID      int        `json:"kid"`
	StoveLv  int        `json:"stove_lv"`
	StoveImg FlexString `json:"stove_lv_content"`
	Avatar   string     `json:"avatar_image"`
	Power    int64      `json:"power"`
}

type PlayerInfoResponse struct {
	Code int        `json:"code"`
	Data PlayerData `json:"data"`
	Msg  string     `json:"msg"`
}

type GiftCodeResponse struct {
	ErrCode int    `json:"err_code"`
	Msg     string `json:"msg"`
}

type RedeemJobEntry struct {
	PlayerId     int64  `json:"playerId"`
	Nickname     string `json:"nickname"`
	VerifyStatus int    `json:"verifyStatus"`
	RedeemStatus int    `json:"redeemStatus"`
	RedeemMsg    string `json:"redeemMsg"`
	GiftCode     string `json:"gitCode"`
}

type RedeemJob struct {
	JobID       string           `json:"jobId"`
	GiftCodes   []string         `json:"giftCodes"`
	RequestedBy string           `json:"requestedBy"`
	UserID      int64            `json:"userId"`
	CreatedAt   time.Time        `json:"createdAt"`
	Status      string           `json:"status"`
	Processed   int              `json:"processed"`
	Total       int              `json:"total"`
	Results     []RedeemJobEntry `json:"results"`
	Targets     []PlayerData
}

//type DiscordConfig struct {
//	WebhookURL      string `json:"webhookUrl"`
//	ChannelID       string `json:"channelId"`
//	AnnounceTimeUTC string `json:"announceTimeUtc"`
//	AnnounceDay     string `json:"announceDay"`
//}

type Hero struct {
	ID             int    `json:"id" db:"id"`
	Name           string `json:"name" db:"name"`
	TroopType      string `json:"troopType" db:"troop_type"`
	LocalImagePath string `json:"localImagePath" db:"local_image_path"`
}

type BattleMetaRequest struct {
	Type          string `json:"type"`
	InfantryRatio int    `json:"infantryRatio"`
	LancerRatio   int    `json:"lancerRatio"`
	MarksmanRatio int    `json:"marksmanRatio"`
	Leads         []int  `json:"leads"`
	Joiners       []int  `json:"joiners"`
}

type ActiveStrategyResponse struct {
	Attack  *BattleMetaRequest `json:"attack"`
	Defense *BattleMetaRequest `json:"defense"`
}
