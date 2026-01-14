import SwiftUI

struct FeedView: View {
    // State Data for interactivity
    @State var posts = [
        Post(id: 1, author: "Marco Rossi", className: "4A", content: "Qualcuno ha gli appunti di Fisica di oggi? Non ho capito l'ultima parte sui vettori 🤯", time: "10 min fa", likes: 5, isLiked: false),
        Post(id: 2, author: "G-Connect Admin", className: "Staff", content: "⚠️ Avviso: Domani la palestra rimarrà chiusa per manutenzione.", time: "1h fa", likes: 120, isLiked: false),
        Post(id: 3, author: "Giulia Bianchi", className: "5B", content: "Vendo libro di Inglese 'Essential Grammar' come nuovo. Chat se interessati!", time: "2h fa", likes: 2, isLiked: false),
        Post(id: 4, author: "Davide Verdi", className: "3C", content: "Cerco compagno per progetto di Informatica. Swift o Python.", time: "3h fa", likes: 0, isLiked: false)
    ]
    
    @State private var showingNewPostSheet = false
    
    var body: some View {
        NavigationView {
            ZStack {
                DesignSystem.Colors.background.ignoresSafeArea()
                
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach($posts) { $post in
                            PostRow(post: $post)
                        }
                    }
                    .padding(.top)
                }
                .navigationTitle("Feed")
                .navigationBarTitleDisplayMode(.inline)
                
                // Floating Action Button
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button(action: { showingNewPostSheet = true }) {
                            Image(systemName: "plus")
                                .font(.title)
                                .foregroundColor(.white)
                                .frame(width: 56, height: 56)
                                .background(DesignSystem.Colors.accentGradient)
                                .clipShape(Circle())
                                .shadow(color: Color(hex: "6366f1").opacity(0.5), radius: 10, x: 0, y: 5)
                        }
                        .padding()
                    }
                }
            }
            .sheet(isPresented: $showingNewPostSheet) {
                NewPostView(isPresented: $showingNewPostSheet, posts: $posts)
            }
        }
    }
}

struct Post: Identifiable {
    let id: Int
    let author: String
    let className: String
    let content: String
    let time: String
    var likes: Int
    var isLiked: Bool
}

struct PostRow: View {
    @Binding var post: Post
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Circle()
                    .fill(LinearGradient(gradient: Gradient(colors: [.gray, .black]), startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 40, height: 40)
                    .overlay(Text(post.author.prefix(1)).foregroundColor(.white).bold())
                
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(post.author)
                            .fontWeight(.bold)
                            .foregroundColor(DesignSystem.Colors.textPrimary)
                        Text("@\(post.className)")
                            .font(.caption)
                            .foregroundColor(DesignSystem.Colors.textSecondary)
                        Spacer()
                        Text(post.time)
                            .font(.caption)
                            .foregroundColor(DesignSystem.Colors.textSecondary)
                    }
                    
                    Text(post.content)
                        .font(.body)
                        .foregroundColor(DesignSystem.Colors.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            
            Divider().background(DesignSystem.Colors.border)
            
            // Interaction Buttons
            HStack(spacing: 40) {
                // Comment Button
                Button(action: { /* Open comments */ }) {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left")
                        Text("Commenta")
                            .font(.caption)
                    }
                    .foregroundColor(DesignSystem.Colors.textSecondary)
                }
                
                // Like Button
                Button(action: {
                    withAnimation(.spring()) {
                        post.isLiked.toggle()
                        post.likes += post.isLiked ? 1 : -1
                    }
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: post.isLiked ? "heart.fill" : "heart")
                            .foregroundColor(post.isLiked ? .red : DesignSystem.Colors.textSecondary)
                        Text("\(post.likes)")
                            .font(.caption)
                            .foregroundColor(DesignSystem.Colors.textSecondary)
                    }
                }
                
                Spacer()
                
                Button(action: { /* Share */ }) {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundColor(DesignSystem.Colors.textSecondary)
                }
            }
            .padding(.top, 4)
        }
        .padding()
        .background(DesignSystem.Colors.cardBackground)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(DesignSystem.Colors.border),
            alignment: .bottom
        )
    }
}

struct NewPostView: View {
    @Binding var isPresented: Bool
    @Binding var posts: [Post]
    @State private var text = ""
    
    var body: some View {
        NavigationView {
            ZStack {
                DesignSystem.Colors.background.ignoresSafeArea()
                
                VStack {
                    TextEditor(text: $text)
                        .padding()
                        .background(DesignSystem.Colors.cardBackground)
                        .cornerRadius(12)
                        .foregroundColor(.white)
                        .padding()
                    
                    Spacer()
                }
            }
            .navigationTitle("Nuovo Post")
            .navigationBarItems(
                leading: Button("Annulla") { isPresented = false },
                trailing: Button("Pubblica") {
                    let newPost = Post(id: Int.random(in: 100...999), author: "Tu", className: "4B", content: text, time: "Adesso", likes: 0, isLiked: false)
                    posts.insert(newPost, at: 0)
                    isPresented = false
                }
                .disabled(text.isEmpty)
            )
        }
    }
}
