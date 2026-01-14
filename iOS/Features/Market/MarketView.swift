import SwiftUI

struct MarketView: View {
    let items = [
        MarketItem(id: 1, title: "Matematica Blu Vol. 3", price: "€15.00", image: "book.closed"),
        MarketItem(id: 2, title: "Appunti Storia 5^ Anno", price: "€5.00", image: "doc.text"),
        MarketItem(id: 3, title: "Calcolatrice Casio", price: "€10.00", image: "function"),
        MarketItem(id: 4, title: "Tablet Grafico", price: "€30.00", image: "ipad")
    ]
    
    @State private var searchText = ""
    
    let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16)
    ]
    
    var body: some View {
        NavigationView {
            ZStack {
                DesignSystem.Colors.background.ignoresSafeArea()
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Search Bar
                        HStack {
                            Image(systemName: "magnifyingglass")
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                            TextField("Cerca libri, appunti...", text: $searchText)
                                .foregroundColor(.white)
                        }
                        .padding()
                        .background(DesignSystem.Colors.cardBackground)
                        .cornerRadius(12)
                        
                        // Categories
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                CategoryPill(title: "Tutti", isSelected: true)
                                CategoryPill(title: "Libri", isSelected: false)
                                CategoryPill(title: "Appunti", isSelected: false)
                                CategoryPill(title: "Elettronica", isSelected: false)
                            }
                        }
                        
                        // Grid
                        LazyVGrid(columns: columns, spacing: 16) {
                            ForEach(items) { item in
                                MarketItemCard(item: item)
                            }
                        }
                    }
                    .padding()
                }
                .navigationTitle("Mercatino")
            }
        }
    }
}

struct MarketItem: Identifiable {
    let id: Int
    let title: String
    let price: String
    let image: String
}

struct CategoryPill: View {
    let title: String
    let isSelected: Bool
    
    var body: some View {
        Text(title)
            .font(.subheadline)
            .fontWeight(.medium)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(isSelected ? DesignSystem.Colors.textPrimary : DesignSystem.Colors.cardBackground)
            .foregroundColor(isSelected ? .black : .white)
            .cornerRadius(20)
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(DesignSystem.Colors.border, lineWidth: isSelected ? 0 : 1)
            )
    }
}

struct MarketItemCard: View {
    let item: MarketItem
    
    var body: some View {
        VStack(crossAxisAlignment: .start) {
            ZStack {
                Rectangle()
                    .fill(Color.gray.opacity(0.1))
                    .frame(height: 120)
                Image(systemName: item.image)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 50)
                    .foregroundColor(DesignSystem.Colors.textSecondary)
            }
            .cornerRadius(12)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(item.price)
                    .font(.headline)
                    .foregroundColor(DesignSystem.Colors.textPrimary)
                Text(item.title)
                    .font(.subheadline)
                    .foregroundColor(DesignSystem.Colors.textSecondary)
                    .lineLimit(2)
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 8)
        }
        .background(DesignSystem.Colors.cardBackground)
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(DesignSystem.Colors.border, lineWidth: 1)
        )
    }
}
