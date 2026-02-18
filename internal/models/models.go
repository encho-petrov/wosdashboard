package models

import "time"

type PlayerData struct {
	Fid      int64  `json:"fid"`
	Nickname string `json:"nickname"`
	KID      int    `json:"kid"`
	StoveLv  int    `json:"stove_lv"`
	StoveImg string `json:"stove_lv_content"`
	Avatar   string `json:"avatar_image"`
	Power    int64  `json:"power"`
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
