import SwiftUI

struct ContentView: View {
    @StateObject var authManager = AuthManager()

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                DashboardView()
            } else {
                LoginView()
            }
        }
        .environmentObject(authManager)
        .preferredColorScheme(.dark) // Forza la Dark Mode
    }
}
