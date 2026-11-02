//go:build windows

package main

import (
	"encoding/json"
	"io"
)

type backupProgress struct {
	PercentDone      float64 `json:"percentDone"`
	BytesDone        uint64  `json:"bytesDone"`
	TotalBytes       uint64  `json:"totalBytes"`
	FilesDone        uint64  `json:"filesDone"`
	TotalFiles       uint64  `json:"totalFiles"`
	SecondsElapsed   uint64  `json:"secondsElapsed"`
	SecondsRemaining uint64  `json:"secondsRemaining"`
}

// Preserve the local log; retain only bounded numeric status for heartbeats.
type progressOutput struct {
	writer  io.Writer
	publish func(backupProgress)
	line    []byte
	discard bool
}

func (w *progressOutput) Write(data []byte) (int, error) {
	n, err := w.writer.Write(data)
	for _, b := range data[:n] {
		if b == '\n' {
			if !w.discard {
				w.status()
			}
			w.line = w.line[:0]
			w.discard = false
		} else if !w.discard {
			if len(w.line) >= 65536 {
				w.line = w.line[:0]
				w.discard = true
			} else {
				w.line = append(w.line, b)
			}
		}
	}
	return n, err
}

func (w *progressOutput) status() {
	var s struct {
		Type       string  `json:"message_type"`
		Percent    float64 `json:"percent_done"`
		Bytes      uint64  `json:"bytes_done"`
		TotalBytes uint64  `json:"total_bytes"`
		Files      uint64  `json:"files_done"`
		TotalFiles uint64  `json:"total_files"`
		Elapsed    uint64  `json:"seconds_elapsed"`
		Remaining  uint64  `json:"seconds_remaining"`
	}
	if json.Unmarshal(w.line, &s) != nil || s.Type != "status" || s.Percent < 0 || s.Percent > 1 {
		return
	}
	for _, v := range []uint64{s.Bytes, s.TotalBytes, s.Files, s.TotalFiles, s.Elapsed, s.Remaining} {
		if v > 1<<53-1 {
			return
		}
	}
	w.publish(backupProgress{s.Percent, s.Bytes, s.TotalBytes, s.Files, s.TotalFiles, s.Elapsed, s.Remaining})
}
