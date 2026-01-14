import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    
    var body: some View {
        ZStack {
            DesignSystem.Colors.background.ignoresSafeArea()
            
            VStack(spacing: 24) {
                Spacer()
                
                Text("G-Connect")
                    .font(DesignSystem.Fonts.title())
                    .foregroundColor(DesignSystem.Colors.textPrimary)
                
                VStack(spacing: 16) {
                    GC_TextField(placeholder: "Email Istituzionale", text: $email)
                    GC_SecureField(placeholder: "Password", text: $password)
                }
                
                if let error = errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.caption)
                }
                
                if isLoading {
                    ProgressView()
                } else {
                    GC_Button(title: "Accedi") {
                        performLogin()
                    }
                }
                
                Spacer()
            }
            .padding()
        }
    }
    
    func performLogin() {
        // Implementazione Mock per MVP
        isLoading = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            isLoading = false
            if !email.isEmpty && !password.isEmpty {
                authManager.login(token: "mock-token-123")
            } else {
                errorMessage = "Inserisci credenziali valide"
            }
        }
    }
}

struct GC_TextField: View {
    let placeholder: String
    @Binding var text: String
    
    var body: some View {
        TextField("", text: $text)
            .placeholder(when: text.isEmpty) {
                Text(placeholder).foregroundColor(DesignSystem.Colors.textSecondary)
            }
            .padding()
            .background(DesignSystem.Colors.cardBackground)
            .cornerRadius(12)
            .foregroundColor(DesignSystem.Colors.textPrimary)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1)
            )
    }
}

struct GC_SecureField: View {
    let placeholder: String
    @Binding var text: String
    
    var body: some View {
        SecureField("", text: $text)
             .placeholder(when: text.isEmpty) {
                Text(placeholder).foregroundColor(DesignSystem.Colors.textSecondary)
            }
            .padding()
            .background(DesignSystem.Colors.cardBackground)
            .cornerRadius(12)
            .foregroundColor(DesignSystem.Colors.textPrimary)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(DesignSystem.Colors.border, lineWidth: 1)
            )
    }
}

extension View {
    func placeholder<Content: View>(
        when shouldShow: Bool,
        alignment: Alignment = .leading,
        @ViewBuilder placeholder: () -> Content) -> some View {

        ZStack(alignment: alignment) {
            placeholder().opacity(shouldShow ? 1 : 0)
            self
        }
    }
}
