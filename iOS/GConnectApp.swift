import SwiftUI

@main
struct GConnectApp: App {
    @StateObject var authManager = AuthManager()
    
    var body: some Scene {
        WindowGroup {
            if authManager.isAuthenticated {
                DashboardView()
                    .environmentObject(authManager)
                    .preferredColorScheme(.dark)
            } else {
                LoginView()
                    .environmentObject(authManager)
                    .preferredColorScheme(.dark)
            }
        }
    }
}

class AuthManager: ObservableObject {
    @Published var isAuthenticated = false
    @Published var token: String?
    
    func login(token: String) {
        self.token = token
        self.isAuthenticated = true
    }
    
    func logout() {
        self.token = nil
        self.isAuthenticated = false
    }
}
