import SwiftUI

// MARK: - Premium Design System

struct DesignSystem {
    
    struct Colors {
        static let background = Color.black // True Black OLED
        static let cardBackground = Color(red: 28/255, green: 28/255, blue: 30/255) // #1C1C1E
        static let border = Color.white.opacity(0.1)
        static let textPrimary = Color.white
        static let textSecondary = Color(red: 142/255, green: 142/255, blue: 147/255) // #8E8E93
        
        static let accentGradient = LinearGradient(
            gradient: Gradient(colors: [Color(hex: "6366f1"), Color(hex: "8b5cf6")]), // Indigo to Violet
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        static let cardGradient = LinearGradient(
            gradient: Gradient(colors: [Color(red: 28/255, green: 28/255, blue: 30/255), Color(red: 20/255, green: 20/255, blue: 22/255)]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    
    struct Layout {
        static let cornerRadius: CGFloat = 24
        static let padding: CGFloat = 20
        static let shadowRadius: CGFloat = 10
        static let shadowY: CGFloat = 4
    }
    
    struct Fonts {
        static func title() -> Font {
            return .system(size: 34, weight: .bold, design: .rounded)
        }
        static func header() -> Font {
            return .system(size: 24, weight: .semibold, design: .rounded)
        }
        static func body() -> Font {
            return .system(size: 17, weight: .regular, design: .default)
        }
        static func caption() -> Font {
            return .system(size: 13, weight: .medium, design: .default)
        }
    }
}

// MARK: - Helpers

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Premium Components

struct GC_Card<Content: View>: View {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: DesignSystem.Layout.cornerRadius)
                .fill(DesignSystem.Colors.cardGradient)
                .overlay(
                    RoundedRectangle(cornerRadius: DesignSystem.Layout.cornerRadius)
                        .stroke(DesignSystem.Colors.border, lineWidth: 0.5)
                )
                .shadow(color: Color.black.opacity(0.4), radius: DesignSystem.Layout.shadowRadius, x: 0, y: DesignSystem.Layout.shadowY)
            
            content
                .padding(DesignSystem.Layout.padding)
        }
    }
}

struct GC_Button: View {
    let title: String
    let icon: String?
    let action: () -> Void
    
    init(title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }
    
    var body: some View {
        Button(action: action) {
            HStack {
                if let icon = icon {
                    Image(systemName: icon)
                }
                Text(title)
                    .fontWeight(.semibold)
            }
            .font(.body)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(DesignSystem.Colors.accentGradient)
            .cornerRadius(18)
            .shadow(color: Color(hex: "6366f1").opacity(0.4), radius: 8, x: 0, y: 4)
        }
    }
}
