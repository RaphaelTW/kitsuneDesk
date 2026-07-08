package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/alvarorichard/Goanime/internal/models"
	"github.com/alvarorichard/Goanime/internal/scraper"
)

const bridgeVersion = "1.0.0"

type request struct {
	Query    string     `json:"query"`
	Language string     `json:"language"`
	Quality  string     `json:"quality"`
	Anime    animeDTO   `json:"anime"`
	Episode  episodeDTO `json:"episode"`
}

type response struct {
	OK    bool       `json:"ok"`
	Data  any        `json:"data,omitempty"`
	Error *errorInfo `json:"error,omitempty"`
}

type errorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

type animeDTO struct {
	Name          string   `json:"name"`
	URL           string   `json:"url"`
	ImageURL      string   `json:"imageUrl"`
	Source        string   `json:"source"`
	MediaType     string   `json:"mediaType"`
	Year          string   `json:"year"`
	AnilistID     int      `json:"anilistId"`
	MalID         int      `json:"malId"`
	Description   string   `json:"description"`
	Genres        []string `json:"genres"`
	AverageScore  int      `json:"averageScore"`
	TotalEpisodes int      `json:"totalEpisodes"`
	Status        string   `json:"status"`
}

type episodeDTO struct {
	Number   string `json:"number"`
	Num      int    `json:"num"`
	URL      string `json:"url"`
	Title    string `json:"title"`
	Aired    string `json:"aired"`
	Duration int    `json:"duration"`
	IsFiller bool   `json:"isFiller"`
	IsRecap  bool   `json:"isRecap"`
	Synopsis string `json:"synopsis"`
}

type streamDTO struct {
	URL      string            `json:"url"`
	Metadata map[string]string `json:"metadata"`
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--version" {
		fmt.Printf("kitsunedesk-goanime-bridge %s\n", bridgeVersion)
		return
	}

	if len(os.Args) < 2 {
		writeResponse(response{OK: false, Error: &errorInfo{Code: "INVALID_COMMAND", Message: "Comando nao informado."}})
		os.Exit(2)
	}

	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		writeResponse(response{OK: false, Error: &errorInfo{Code: "INVALID_REQUEST", Message: "Solicitacao invalida.", Detail: err.Error()}})
		os.Exit(2)
	}

	command := strings.ToLower(strings.TrimSpace(os.Args[1]))
	data, err := runSilenced(func() (any, error) {
		manager := scraper.NewScraperManager()

		switch command {
		case "search":
			return searchAnime(manager, req)
		case "episodes":
			return listEpisodes(manager, req)
		case "stream":
			return resolveStream(manager, req)
		default:
			return nil, fmt.Errorf("comando desconhecido: %s", command)
		}
	})

	if err != nil {
		code, message := classifyError(err)
		writeResponse(response{OK: false, Error: &errorInfo{Code: code, Message: message, Detail: err.Error()}})
		os.Exit(1)
	}

	writeResponse(response{OK: true, Data: data})
}

func runSilenced(action func() (any, error)) (any, error) {
	originalStdout := os.Stdout
	originalStderr := os.Stderr

	nullFile, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err == nil {
		os.Stdout = nullFile
		os.Stderr = nullFile
		defer func() {
			os.Stdout = originalStdout
			os.Stderr = originalStderr
			_ = nullFile.Close()
		}()
	}

	return action()
}

func searchAnime(manager *scraper.ScraperManager, req request) ([]animeDTO, error) {
	query := strings.TrimSpace(req.Query)
	if len(query) < 2 {
		return nil, errors.New("digite pelo menos dois caracteres")
	}

	results, err := manager.SearchAnime(query, nil)
	if err != nil {
		return nil, err
	}

	items := make([]animeDTO, 0, len(results))
	seen := make(map[string]struct{})

	for _, anime := range results {
		if anime == nil || anime.URL == "" {
			continue
		}

		// SuperFlix requires a season/media flow that is outside the anime GUI bridge.
		// The regular GoAnime TUI remains available for those results.
		if strings.EqualFold(anime.Source, "SuperFlix") {
			continue
		}

		key := strings.ToLower(strings.TrimSpace(anime.Source + "|" + anime.URL))
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		items = append(items, toAnimeDTO(anime))
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("nenhum anime compativel encontrado para: %s", query)
	}

	if strings.EqualFold(req.Language, "dub") {
		sort.SliceStable(items, func(i, j int) bool {
			return isPortugueseResult(items[i]) && !isPortugueseResult(items[j])
		})
	}

	return items, nil
}

func listEpisodes(manager *scraper.ScraperManager, req request) ([]episodeDTO, error) {
	if strings.TrimSpace(req.Anime.URL) == "" {
		return nil, errors.New("anime sem URL de origem")
	}

	sourceType, err := parseSource(req.Anime.Source)
	if err != nil {
		return nil, err
	}

	scr, err := manager.GetScraper(sourceType)
	if err != nil {
		return nil, err
	}

	mode := normalizeMode(req.Language)
	var episodes []models.Episode

	if sourceType == scraper.AllAnimeType {
		adapter, ok := scr.(*scraper.AllAnimeAdapter)
		if !ok {
			return nil, errors.New("adaptador AllAnime indisponivel")
		}

		episodeNumbers, listErr := adapter.Client().GetEpisodesList(req.Anime.URL, mode)
		if listErr != nil {
			return nil, listErr
		}

		for index, number := range episodeNumbers {
			episodes = append(episodes, models.Episode{
				Number: number,
				Num:    index + 1,
				URL:    req.Anime.URL,
				Title:  models.TitleDetails{Romaji: fmt.Sprintf("Episodio %s", number)},
			})
		}
	} else {
		episodes, err = scr.GetAnimeEpisodes(req.Anime.URL)
		if err != nil {
			return nil, err
		}
	}

	items := make([]episodeDTO, 0, len(episodes))
	for _, episode := range episodes {
		items = append(items, toEpisodeDTO(episode))
	}

	if len(items) == 0 {
		return nil, errors.New("nenhum episodio encontrado")
	}

	return items, nil
}

func resolveStream(manager *scraper.ScraperManager, req request) (streamDTO, error) {
	if strings.TrimSpace(req.Anime.URL) == "" || strings.TrimSpace(req.Episode.Number) == "" {
		return streamDTO{}, errors.New("anime ou episodio invalido")
	}

	sourceType, err := parseSource(req.Anime.Source)
	if err != nil {
		return streamDTO{}, err
	}

	scr, err := manager.GetScraper(sourceType)
	if err != nil {
		return streamDTO{}, err
	}

	quality := normalizeQuality(req.Quality)
	mode := normalizeMode(req.Language)
	var streamURL string
	var metadata map[string]string

	if sourceType == scraper.AllAnimeType {
		streamURL, metadata, err = scr.GetStreamURL(req.Anime.URL, req.Episode.Number, quality, mode)
	} else {
		streamURL, metadata, err = scr.GetStreamURL(req.Episode.URL)
	}

	if err != nil {
		return streamDTO{}, err
	}

	streamURL = strings.TrimSpace(streamURL)
	if streamURL == "" {
		return streamDTO{}, errors.New("a fonte nao retornou um link de video")
	}

	parsedURL, parseErr := url.Parse(streamURL)
	if parseErr != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return streamDTO{}, errors.New("a fonte retornou um link de video invalido")
	}

	if metadata == nil {
		metadata = make(map[string]string)
	}
	metadata["source"] = req.Anime.Source
	metadata["quality"] = quality
	metadata["mode"] = mode

	return streamDTO{URL: streamURL, Metadata: metadata}, nil
}

func toAnimeDTO(anime *models.Anime) animeDTO {
	imageURL := anime.ImageURL
	if imageURL == "" {
		if anime.Details.CoverImage.Large != "" {
			imageURL = anime.Details.CoverImage.Large
		} else {
			imageURL = anime.Details.CoverImage.Medium
		}
	}

	description := anime.Overview
	if description == "" {
		description = anime.Details.Description
	}

	genres := anime.Genres
	if len(genres) == 0 {
		genres = anime.Details.Genres
	}

	return animeDTO{
		Name:          anime.Name,
		URL:           anime.URL,
		ImageURL:      imageURL,
		Source:        anime.Source,
		MediaType:     string(anime.MediaType),
		Year:          anime.Year,
		AnilistID:     anime.AnilistID,
		MalID:         anime.MalID,
		Description:   stripHTML(description),
		Genres:        genres,
		AverageScore:  anime.Details.AverageScore,
		TotalEpisodes: anime.Details.Episodes,
		Status:        anime.Details.Status,
	}
}

func toEpisodeDTO(episode models.Episode) episodeDTO {
	title := episode.Title.English
	if title == "" {
		title = episode.Title.Romaji
	}
	if title == "" {
		title = episode.Title.Japanese
	}
	if title == "" {
		title = "Episodio " + episode.Number
	}

	return episodeDTO{
		Number:   episode.Number,
		Num:      episode.Num,
		URL:      episode.URL,
		Title:    title,
		Aired:    episode.Aired,
		Duration: episode.Duration,
		IsFiller: episode.IsFiller,
		IsRecap:  episode.IsRecap,
		Synopsis: stripHTML(episode.Synopsis),
	}
}

func parseSource(source string) (scraper.ScraperType, error) {
	normalized := strings.ToLower(strings.TrimSpace(source))
	switch normalized {
	case "allanime", "all anime", "english":
		return scraper.AllAnimeType, nil
	case "animefire", "animefire.io", "anime fire":
		return scraper.AnimefireType, nil
	case "goyabu":
		return scraper.GoyabuType, nil
	default:
		return scraper.AllAnimeType, fmt.Errorf("fonte nao suportada pela interface grafica: %s", source)
	}
}

func normalizeQuality(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" || value == "auto" || value == "best" {
		return "best"
	}
	if value == "worst" {
		return "worst"
	}
	value = strings.TrimSuffix(value, "p")
	if _, err := strconv.Atoi(value); err == nil {
		return value + "p"
	}
	return "best"
}

func normalizeMode(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "dub") {
		return "dub"
	}
	return "sub"
}

func isPortugueseResult(anime animeDTO) bool {
	value := strings.ToLower(anime.Name + " " + anime.Source)
	return strings.Contains(value, "pt-br") ||
		strings.Contains(value, "dublado") ||
		strings.Contains(value, "animefire") ||
		strings.Contains(value, "goyabu")
}

func stripHTML(value string) string {
	value = strings.ReplaceAll(value, "<br>", " ")
	value = strings.ReplaceAll(value, "<br/>", " ")
	value = strings.ReplaceAll(value, "<br />", " ")

	var builder strings.Builder
	insideTag := false
	for _, char := range value {
		switch char {
		case '<':
			insideTag = true
		case '>':
			insideTag = false
		default:
			if !insideTag {
				builder.WriteRune(char)
			}
		}
	}
	return strings.TrimSpace(strings.Join(strings.Fields(builder.String()), " "))
}

func classifyError(err error) (string, string) {
	message := strings.ToLower(err.Error())

	switch {
	case strings.Contains(message, "no such host"),
		strings.Contains(message, "name resolution"),
		strings.Contains(message, "getaddrinfo"),
		strings.Contains(message, "dns"):
		return "SOURCE_DNS_ERROR", "Uma das fontes nao pôde ser localizada. Tente novamente ou escolha outro resultado."
	case strings.Contains(message, "timeout"), strings.Contains(message, "timed out"):
		return "SOURCE_TIMEOUT", "As fontes demoraram demais para responder. Tente novamente em alguns instantes."
	case strings.Contains(message, "no anime found"), strings.Contains(message, "nenhum anime"):
		return "ANIME_NOT_FOUND", "Nenhum anime foi encontrado com esse nome."
	case strings.Contains(message, "nenhum episodio"), strings.Contains(message, "no episodes"):
		return "EPISODES_NOT_FOUND", "Nenhum episodio foi encontrado para esse titulo."
	case strings.Contains(message, "link de video"), strings.Contains(message, "stream"):
		return "STREAM_UNAVAILABLE", "A fonte encontrou o episodio, mas nao entregou um link de video valido."
	case strings.Contains(message, "fonte nao suportada"):
		return "SOURCE_UNSUPPORTED", "Esse resultado ainda nao e suportado pela interface grafica. Abra-o no GoAnime classico."
	default:
		return "GOANIME_ERROR", "O GoAnime nao conseguiu concluir esta operacao."
	}
}

func writeResponse(value response) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}
