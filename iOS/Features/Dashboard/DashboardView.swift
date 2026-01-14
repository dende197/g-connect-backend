import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var authManager: AuthManager
    
    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Image(systemName: "house.fill")
                    Text("Home")
                }
            
            FeedView()
                .tabItem {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                    Text("Feed")
                }
            
            PlannerListView()
                .tabItem {
                    Image(systemName: "calendar")
                    Text("Planner")
                }
            
            MarketView()
                .tabItem {
                    Image(systemName: "bag.fill")
                    Text("Market")
                }
            
            ProfileView()
                .tabItem {
                    Image(systemName: "person.fill")
                    Text("Profilo")
                }
        }
        .accentColor(Color(hex: "6366f1")) // Indigo Accent
    }
}

struct HomeView: View {
    @StateObject var newsService = SchoolNewsService()
    
    var body: some View {
        ZStack {
            DesignSystem.Colors.background.ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Buongiorno,")
                                .font(.subheadline)
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                            Text("Andrea")
                                .font(DesignSystem.Fonts.title())
                                .foregroundColor(DesignSystem.Colors.textPrimary)
                        }
                        Spacer()
                        Circle()
                            .fill(LinearGradient(gradient: Gradient(colors: [.blue, .purple]), startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 50, height: 50)
                            .overlay(Text("A").font(.title2).bold().foregroundColor(.white))
                            .shadow(radius: 5)
                            .onTapGesture {
                                // Action for profile
                            }
                    }
                    .padding(.horizontal)
                    .padding(.top)
                    
                    // News Carousel
                    VStack(alignment: .leading, spacing: 12) {
                        Text("In Evidenza")
                            .font(DesignSystem.Fonts.header())
                            .foregroundColor(DesignSystem.Colors.textPrimary)
                            .padding(.horizontal)
                        
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 16) {
                                ForEach(newsService.news) { news in
                                    NewsCard(news: news)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    
                    // Smart Widget (Prossima Ora)
                    GC_Card {
                        HStack {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("TRA 10 MIN")
                                    .font(DesignSystem.Fonts.caption())
                                    .fontWeight(.bold)
                                    .foregroundColor(DesignSystem.Colors.textSecondary)
                                Text("Matematica")
                                    .font(DesignSystem.Fonts.header())
                                    .foregroundColor(DesignSystem.Colors.textPrimary)
                                HStack {
                                    Image(systemName: "mappin.circle.fill")
                                    Text("Aula 3C")
                                }
                                .font(.subheadline)
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                            }
                            Spacer()
                            ZStack {
                                Circle()
                                    .stroke(DesignSystem.Colors.border, lineWidth: 4)
                                    .frame(width: 60, height: 60)
                                Circle()
                                    .trim(from: 0, to: 0.75)
                                    .stroke(DesignSystem.Colors.accentGradient, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                                    .frame(width: 60, height: 60)
                                    .rotationEffect(.degrees(-90))
                                Text("45'")
                                    .font(.caption)
                                    .bold()
                            }
                        }
                    }
                    .padding(.horizontal)
                    
                    // Quick Actions Grid
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                        ActionCard(icon: "chart.bar.fill", title: "Voti", color: "34d399") // Emerald
                        ActionCard(icon: "list.bullet.rectangle.portrait.fill", title: "Note", color: "f87171") // Red
                        ActionCard(icon: "clock.fill", title: "Orario", color: "60a5fa") // Blue
                        ActionCard(icon: "bell.fill", title: "Avvisi", color: "fbbf24") // Amber
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 30) // Space for TabBar
            }
        }
    }
}

struct NewsCard: View {
    let news: SchoolNews
    
    var body: some View {
        VStack(alignment: .leading) {
            Spacer()
            // Gradient Overlay
            LinearGradient(gradient: Gradient(colors: [.clear, .black.opacity(0.8)]), startPoint: .top, endPoint: .bottom)
                .frame(height: 100)
                .overlay(
                    VStack(alignment: .leading, spacing: 4) {
                        Spacer()
                        Text(news.date.uppercased())
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(Color.white.opacity(0.8))
                        Text(news.title)
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .lineLimit(2)
                    }
                    .padding()
                , alignment: .bottomLeading)
        }
        .frame(width: 250, height: 160)
        .background(Color.gray.opacity(0.3)) // Placeholder image color
        .cornerRadius(DesignSystem.Layout.cornerRadius)
        .overlay(
            RoundedRectangle(cornerRadius: DesignSystem.Layout.cornerRadius)
                .stroke(DesignSystem.Colors.border, lineWidth: 0.5)
        )
    }
}

struct ActionCard: View {
    let icon: String
    let title: String
    let color: String
    
    var body: some View {
        Button(action: {
            // Action Placeholder
        }) {
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(DesignSystem.Colors.cardBackground)
                    .shadow(color: Color.black.opacity(0.3), radius: 5, x: 0, y: 2)
                
                VStack(spacing: 12) {
                    Circle()
                        .fill(Color(hex: color).opacity(0.2))
                        .frame(width: 50, height: 50)
                        .overlay(
                            Image(systemName: icon)
                                .font(.system(size: 24))
                                .foregroundColor(Color(hex: color))
                        )
                    
                    Text(title)
                        .font(.headline)
                        .foregroundColor(DesignSystem.Colors.textPrimary)
                }
                .padding()
            }
            .frame(height: 120)
        }
        .buttonStyle(PlainButtonStyle()) // Needed to avoid list/scroll flicker
    }
}
