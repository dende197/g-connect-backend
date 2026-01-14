import Foundation

struct SchoolNews: Identifiable {
    let id: Int
    let title: String
    let summary: String
    let date: String
    let imageUrl: String?
}

class SchoolNewsService: ObservableObject {
    @Published var news: [SchoolNews] = []
    
    init() {
        fetchNews()
    }
    
    func fetchNews() {
        // Simulazione caricamento da sito scuola
        self.news = [
            SchoolNews(id: 1, title: "Chiusura scuole per neve", summary: "Disposta la chiusura per domani 15 Gennaio per allerta meteo.", date: "Oggi", imageUrl: "snow"),
            SchoolNews(id: 2, title: "Olimpiadi della Matematica", summary: "Aperte le iscrizioni per le selezioni d'istituto. Rivolgersi al Prof. Bianchi.", date: "Ieri", imageUrl: "function"),
            SchoolNews(id: 3, title: "Nuovo Orario Lezioni", summary: "Dal 1 Gennaio entrerà in vigore il nuovo orario definitivo.", date: "2 gg fa", imageUrl: "clock")
        ]
    }
    
    func openArticle(id: Int) {
        print("Opening article \(id)")
        // Qui si aprirebbe una WebView
    }
}
